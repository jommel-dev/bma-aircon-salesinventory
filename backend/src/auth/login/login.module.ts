import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { LoginService } from './login.service';
import { LoginController } from './login.controller';
import { DatabaseModule } from 'src/database/database.module';
import { AuditLogModule } from 'src/audit-log/audit-log.module';

function normalizeJwtExpiresIn(value: string, fallback: string): string | number {
  const trimmed = String(value ?? fallback).trim();
  if (/^\d+$/.test(trimmed)) {
    // jsonwebtoken treats numeric strings as milliseconds, convert to number for seconds.
    return Number(trimmed);
  }

  return trimmed || fallback;
}

@Module({
  imports: [
    DatabaseModule,
    AuditLogModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'dev-secret'),
        signOptions: {
          expiresIn: normalizeJwtExpiresIn(
            configService.get<string>('JWT_EXPIRES_IN', '1h') ?? '1h',
            '1h',
          ) as any,
        },
      }),
    }),
  ],
  controllers: [LoginController],
  providers: [LoginService],
})
export class LoginModule {}
