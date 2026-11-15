import {
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  name: string;

  @Matches(/^[a-z][a-z0-9-]{2,30}$/)
  slug: string;

  @IsEmail()
  @MaxLength(254)
  contactEmail: string;

  @IsIn(['dev', 'staging', 'prod'])
  environment: string;

  @IsIn(['terraform', 'cloudformation', 'opentofu', 'pulumi'])
  engine: string;

  @IsString()
  @IsNotEmpty()
  planId: string;

  @IsString()
  @MinLength(10)
  @MaxLength(100)
  adminPassword: string;

  @IsOptional()
  @Matches(/^\+?[0-9 ()-]{7,25}$/)
  contactPhone?: string;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string;
}

export class CreateTenantRequestDto extends CreateTenantDto {
  @IsString()
  @Matches(/^\+?[0-9 ()-]{7,25}$/)
  phone: string;

  @IsOptional()
  @IsString()
  @MaxLength(0)
  website?: string;
}

export class ReviewTenantRequestDto {
  @IsIn(['APPROVE', 'REJECT'])
  decision: 'APPROVE' | 'REJECT';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class TenantActionDto {
  @IsIn([
    'DEPLOY',
    'UPDATE',
    'SUSPEND',
    'RESUME',
    'BACKUP',
    'RESTORE',
    'DELETE',
    'CHANGE_PLAN',
    'TEST_ALERT',
    'CLEAR_ALERT',
    'MIGRATE',
  ])
  action: string;

  @IsOptional()
  @IsString()
  planId?: string;

  @IsOptional()
  @IsString()
  backupId?: string;

  @IsOptional()
  @IsString()
  confirmation?: string;
}

export class UpdatePlanDto {
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  name: string;

  @IsInt()
  @Min(1)
  @Max(100000)
  maxStudents: number;

  @IsInt()
  @Min(1)
  @Max(10000)
  maxSessions: number;
}
