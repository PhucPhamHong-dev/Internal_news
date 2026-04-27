import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { CurrentUser, type AuthUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { AuthService } from "./auth.service";
import { GoogleCallbackDto } from "./dto/google-callback.dto";
import { LinkMsnvDto } from "./dto/link-msnv.dto";
import { EmployeeLoginDto } from "./dto/employee-login.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("auth/google/callback")
  googleCallback(@Body() body: GoogleCallbackDto) {
    return this.authService.googleCallback(body.idToken);
  }

  @Post("auth/employee-login")
  employeeLogin(@Body() body: EmployeeLoginDto) {
    return this.authService.employeeLogin(body.msnv.trim().toUpperCase(), body.password);
  }

  @UseGuards(JwtAuthGuard)
  @Post("auth/change-password")
  changePassword(@CurrentUser() user: AuthUser, @Body() body: ChangePasswordDto) {
    return this.authService.changePassword(user.sub, body.newPassword, body.currentPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Post("auth/link-msnv")
  linkMsnv(@CurrentUser() user: AuthUser, @Body() body: LinkMsnvDto) {
    return this.authService.linkMsnv(user.sub, body.msnv.trim().toUpperCase());
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user.sub);
  }
}
