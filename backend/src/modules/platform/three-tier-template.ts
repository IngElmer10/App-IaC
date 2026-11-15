import type { TenantRole } from './tenant-resources.js';

type Template = {
  Resources: Record<string, any>;
  Outputs: Record<string, any>;
  Description: string;
  Metadata: any;
  Parameters: Record<string, any>;
};

export function threeTierTemplate(
  base: Template,
  userData: Record<TenantRole, string>,
  slug: string,
  environment: string,
  previous?: Template,
  migrating = false,
) {
  const template = structuredClone(base);
  const reference = (name: string) => ({ Ref: name });
  const substitute = (value: string) => ({ 'Fn::Sub': value });
  const resources = template.Resources;
  template.Description =
    'Three independent EC2 instances per attendance tenant: frontend, backend and PostgreSQL, with private service access and monitoring.';
  template.Metadata['com.aws.cloudformation.Context'].arch =
    'Three isolated service instances per tenant. PostgreSQL accepts only its own backend; monitoring runs on the frontend.';
  const tags = (role: string) => [
    { Key: 'Project', Value: 'AttendancePlatformMVP' },
    { Key: 'Tenant', Value: reference('TenantId') },
    { Key: 'Name', Value: `${slug}-${role}-${environment}` },
    { Key: 'Role', Value: role },
  ];
  const ingress = (port: number, group: string) => ({
    IpProtocol: 'tcp',
    FromPort: port,
    ToPort: port,
    SourceSecurityGroupId: reference(group),
  });
  resources.BackendSecurityGroup = {
    Type: 'AWS::EC2::SecurityGroup',
    Properties: {
      GroupDescription: 'Tenant private API and monitoring',
      VpcId: reference('VpcId'),
      SecurityGroupIngress: [
        ingress(3001, 'SecurityGroup'),
        ingress(9100, 'SecurityGroup'),
      ],
    },
  };
  resources.DatabaseSecurityGroup = {
    Type: 'AWS::EC2::SecurityGroup',
    Properties: {
      GroupDescription: 'Tenant private PostgreSQL and monitoring',
      VpcId: reference('VpcId'),
      SecurityGroupIngress: [
        ingress(5432, 'BackendSecurityGroup'),
        ingress(9100, 'SecurityGroup'),
        ingress(9187, 'SecurityGroup'),
      ],
    },
  };
  for (const [role, prefix] of [
    ['frontend', ''],
    ['backend', 'Backend'],
    ['database', 'Database'],
  ] as const) {
    const ownParameter = substitute(
      `arn:aws:ssm:\${AWS::Region}:\${AWS::AccountId}:parameter\${ParameterName}/${role}`,
    );
    const statements: any[] = [
      {
        Effect: 'Allow',
        Action: ['s3:GetObject'],
        Resource: substitute('arn:aws:s3:::${ArtifactBucket}/mvp/artifacts/*'),
      },
      { Effect: 'Allow', Action: ['ssm:GetParameter'], Resource: ownParameter },
      {
        Effect: 'Deny',
        Action: [
          'ssm:GetParameter',
          'ssm:GetParameters',
          'ssm:GetParametersByPath',
        ],
        NotResource: ownParameter,
      },
    ];
    if (role === 'database' || (role === 'frontend' && migrating))
      statements.push({
        Effect: 'Allow',
        Action: ['s3:GetObject', 's3:PutObject'],
        Resource: substitute(
          'arn:aws:s3:::${ArtifactBucket}/mvp/backups/${TenantId}/*',
        ),
      });
    resources[`${prefix}Role`] = structuredClone(resources.Role);
    resources[`${prefix}Role`].Properties.Policies = [
      {
        PolicyName: 'TenantData',
        PolicyDocument: { Version: '2012-10-17', Statement: statements },
      },
    ];
    resources[`${prefix}Profile`] = {
      Type: 'AWS::IAM::InstanceProfile',
      Properties: { Roles: [reference(`${prefix}Role`)] },
    };
    if (role === 'frontend') {
      if (previous) {
        resources.Server = structuredClone(previous.Resources.Server);
        resources.Machine = structuredClone(previous.Resources.Machine);
      } else {
        resources.Server.Properties.LaunchTemplateData.UserData = Buffer.from(
          userData.frontend,
        ).toString('base64');
        resources.Server.Properties.LaunchTemplateData.BlockDeviceMappings[0].Ebs.VolumeSize = 20;
      }
      resources.Machine.Properties.Tags = tags(role);
    } else {
      resources[`${prefix}Machine`] = {
        Type: 'AWS::EC2::Instance',
        DependsOn: [`${prefix}Role`],
        Properties: {
          ImageId: reference('Ami'),
          InstanceType: reference('InstanceType'),
          IamInstanceProfile: reference(`${prefix}Profile`),
          MetadataOptions: {
            HttpTokens: 'required',
            HttpPutResponseHopLimit: 1,
          },
          BlockDeviceMappings: [
            {
              DeviceName: '/dev/sda1',
              Ebs: {
                VolumeSize: role === 'database' ? reference('StorageGb') : 20,
                VolumeType: 'gp3',
                Encrypted: true,
                DeleteOnTermination: true,
              },
            },
          ],
          NetworkInterfaces: [
            {
              DeviceIndex: 0,
              AssociatePublicIpAddress: true,
              SubnetId: reference('SubnetId'),
              GroupSet: [reference(`${prefix}SecurityGroup`)],
            },
          ],
          UserData: Buffer.from(userData[role]).toString('base64'),
          Tags: tags(role),
        },
      };
      template.Outputs[`${prefix}InstanceId`] = {
        Value: reference(`${prefix}Machine`),
      };
    }
  }
  return template;
}
