import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class MarkAttendanceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  sessionId: string;
}
