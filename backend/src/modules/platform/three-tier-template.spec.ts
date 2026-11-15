import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { threeTierTemplate } from './three-tier-template.js';

const base = () =>
  JSON.parse(
    readFileSync(
      resolve('../infrastructure/cloudformation/tenant.json'),
      'utf8',
    ),
  );
const data = {
  frontend: '#!/bin/bash\necho frontend',
  backend: '#!/bin/bash\necho backend',
  database: '#!/bin/bash\necho database',
};

describe('Plantilla CloudFormation de tres instancias', () => {
  it('crea tres máquinas con nombres identificables y exporta sus identificadores', () => {
    const template = threeTierTemplate(base(), data, 'uagrm', 'dev');
    const machines = Object.values(template.Resources).filter(
      (resource) => resource.Type === 'AWS::EC2::Instance',
    );
    expect(machines).toHaveLength(3);
    expect(
      machines
        .map(
          (machine) =>
            machine.Properties.Tags.find(
              (tag: { Key: string }) => tag.Key === 'Name',
            ).Value,
        )
        .sort((left: string, right: string) => left.localeCompare(right)),
    ).toEqual([
      'uagrm-backend-dev',
      'uagrm-database-dev',
      'uagrm-frontend-dev',
    ]);
    expect(template.Outputs.BackendInstanceId.Value).toEqual({
      Ref: 'BackendMachine',
    });
    expect(template.Outputs.DatabaseInstanceId.Value).toEqual({
      Ref: 'DatabaseMachine',
    });
  });

  it('no cambia la definición de arranque de una VM existente durante la migración', () => {
    const previous = base();
    previous.Resources.Server.Properties.LaunchTemplateData.UserData =
      'legacy-bootstrap';
    previous.Resources.Machine.Properties.LaunchTemplate.Version = {
      'Fn::GetAtt': ['Server', 'LatestVersionNumber'],
    };
    const template = threeTierTemplate(base(), data, 'uagrm', 'dev', previous);
    expect(template.Resources.Server).toEqual(previous.Resources.Server);
    expect(template.Resources.Machine.Properties.LaunchTemplate).toEqual(
      previous.Resources.Machine.Properties.LaunchTemplate,
    );
  });

  it('aísla PostgreSQL del exterior y entrega a cada rol únicamente su propio parámetro', () => {
    const template = threeTierTemplate(base(), data, 'uagrm', 'dev');
    expect(
      template.Resources.DatabaseSecurityGroup.Properties.SecurityGroupIngress.find(
        (rule: { FromPort: number }) => rule.FromPort === 5432,
      ).SourceSecurityGroupId,
    ).toEqual({ Ref: 'BackendSecurityGroup' });
    const policies =
      template.Resources.Role.Properties.Policies[0].PolicyDocument.Statement;
    expect(
      policies.find((policy: { Effect: string }) => policy.Effect === 'Deny')
        .NotResource['Fn::Sub'],
    ).toMatch(/\/frontend$/);
    expect(
      policies.some((policy: { Action: string[] }) =>
        policy.Action.includes('s3:PutObject'),
      ),
    ).toBe(false);
  });
});
