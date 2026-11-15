import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RestartModuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}

export class ActivateModuleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  moduleId: string;
}
