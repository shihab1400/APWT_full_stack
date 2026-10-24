import { Body, Controller, Get, HttpCode, Inject, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  loginSchema,
  registerSchema,
  type AuthUser,
  type LoginDto,
  type RegisterDto,
} from '@mindease/shared';
import { CurrentUser, Public, type RequestUser } from '../common/decorators.js';
import { ZodValidationPipe, openApiSchema } from '../common/zod.js';
import { ENV, type Env } from '../config/env.js';
import { AuthService, type IssuedTokens } from './auth.service.js';

// Credential endpoints get a tighter limit than the global default.
const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  @ApiOperation({ summary: 'Create a USER or DOCTOR account and start a session' })
  @ApiBody({ schema: openApiSchema(registerSchema) })
  async register(
    @Body(new ZodValidationPipe(registerSchema)) dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthUser> {
    const { user, tokens } = await this.auth.register(dto);
    this.setCookies(res, tokens);
    return user;
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiBody({ schema: openApiSchema(loginSchema) })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthUser> {
    const { user, tokens } = await this.auth.login(dto);
    this.setCookies(res, tokens);
    return user;
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate the refresh cookie and issue a new access cookie' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthUser> {
    try {
      const { user, tokens } = await this.auth.refresh(readCookie(req, REFRESH_TOKEN_COOKIE));
      this.setCookies(res, tokens);
      return user;
    } catch (err) {
      this.clearCookies(res);
      throw err;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke the refresh token and clear cookies' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(readCookie(req, REFRESH_TOKEN_COOKIE));
    this.clearCookies(res);
  }

  @Public()
  @Get('verify-email')
  @ApiOperation({ summary: 'Confirm an email address from the verification link' })
  async verifyEmail(@Query('token') token: string): Promise<{ verified: true }> {
    await this.auth.verifyEmail(token ?? '');
    return { verified: true };
  }

  @Get('me')
  @ApiCookieAuth(ACCESS_TOKEN_COOKIE)
  @ApiOperation({ summary: 'The current user' })
  me(@CurrentUser() user: RequestUser): Promise<AuthUser> {
    return this.auth.me(user.id);
  }

  private setCookies(res: Response, tokens: IssuedTokens) {
    const base = {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: this.env.NODE_ENV === 'production',
      path: '/',
    };
    res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
      ...base,
      maxAge: this.env.JWT_ACCESS_TTL_SECONDS * 1000,
    });
    res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
      ...base,
      expires: tokens.refreshExpiresAt,
    });
  }

  private clearCookies(res: Response) {
    res.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/' });
  }
}

function readCookie(req: Request, name: string): string | undefined {
  return (req.cookies as Record<string, string> | undefined)?.[name];
}
