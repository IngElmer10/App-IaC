import { Body, Controller, Post } from '@nestjs/common';
import { LoginDto } from './login.dto.js';
import { AuthService } from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.validateCredentials(dto.username, dto.password);
  }
}
