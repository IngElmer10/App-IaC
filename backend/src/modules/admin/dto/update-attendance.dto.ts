import { IsIn } from 'class-validator';

export class UpdateAttendanceDto {
  @IsIn(['PRESENT', 'ABSENT'])
  status: 'PRESENT' | 'ABSENT';
}
