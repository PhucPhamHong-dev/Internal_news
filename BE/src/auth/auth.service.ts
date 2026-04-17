import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { OAuth2Client } from "google-auth-library";
import { RoleEnum } from "../common/enums";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AuthService {
  private readonly oAuthClient: OAuth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService
  ) {
    this.oAuthClient = new OAuth2Client(this.config.get<string>("GOOGLE_CLIENT_ID"));
  }

  async googleCallback(idToken: string) {
    const ticket = await this.oAuthClient.verifyIdToken({
      idToken,
      audience: this.config.get<string>("GOOGLE_CLIENT_ID")
    });

    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || !payload.name) {
      throw new UnauthorizedException("Google token khong hop le");
    }

    const adminWhitelist = (this.config.get<string>("ADMIN_EMAIL_WHITELIST") || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);

    const email = payload.email.toLowerCase();
    const isAdmin = adminWhitelist.includes(email);

    let user = await this.prisma.user.findUnique({
      where: { googleSub: payload.sub },
      include: { employee: true }
    });

    if (user) {
      this.ensureEmployeeActive(user.employee);
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          email,
          fullName: payload.name,
          avatarUrl: payload.picture || null,
          role: isAdmin ? RoleEnum.ADMIN : undefined
        },
        include: { employee: true }
      });
    } else {
      const existingByEmail = await this.prisma.user.findUnique({
        where: { email },
        include: { employee: true }
      });

      if (existingByEmail) {
        this.ensureEmployeeActive(existingByEmail.employee);
        user = await this.prisma.user.update({
          where: { id: existingByEmail.id },
          data: {
            googleSub: payload.sub,
            fullName: payload.name,
            avatarUrl: payload.picture || null,
            role: isAdmin ? RoleEnum.ADMIN : undefined
          },
          include: { employee: true }
        });
      } else {
        user = await this.prisma.user.create({
          data: {
            googleSub: payload.sub,
            email,
            fullName: payload.name,
            avatarUrl: payload.picture || null,
            role: isAdmin ? RoleEnum.ADMIN : RoleEnum.VIEWER
          },
          include: { employee: true }
        });
      }
    }

    return {
      token: this.signJwt(user),
      linked: this.isLinked(user.role, user.employee),
      profile: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        role: user.role,
        linkedMsnv: user.employee?.msnv ?? null,
        linked: this.isLinked(user.role, user.employee)
      }
    };
  }

  async linkMsnv(userId: string, msnv: string) {
    const employee = await this.prisma.employeeMaster.findUnique({ where: { msnv } });
    if (!employee) {
      throw new BadRequestException("MSNV khong hop le");
    }
    if (!employee.isActive) {
      throw new ForbiddenException("Tai khoan nhan su dang bi vo hieu hoa");
    }
    const userByMsnv = await this.prisma.user.findUnique({
      where: { employeeId: employee.id }
    });
    if (userByMsnv && userByMsnv.id !== userId) {
      throw new BadRequestException("MSNV da duoc dang ky");
    }

    const current = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!current) {
      throw new UnauthorizedException();
    }

    const nextRole = current.role === RoleEnum.ADMIN ? RoleEnum.ADMIN : employee.preferredRole;
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        employeeId: employee.id,
        fullName: employee.fullName,
        role: nextRole
      },
      include: { employee: true }
    });
    return {
      token: this.signJwt(user),
      linked: true,
      profile: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        role: user.role,
        linkedMsnv: user.employee?.msnv ?? null,
        linked: true
      }
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { employee: true }
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    this.ensureEmployeeActive(user.employee);
    return {
      id: user.id,
      email: user.email ?? "",
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      linkedMsnv: user.employee?.msnv ?? null,
      linked: this.isLinked(user.role, user.employee)
    };
  }

  private isLinked(role: string, employee: { msnv: string } | null | undefined) {
    if (role === RoleEnum.ADMIN) {
      return true;
    }
    return Boolean(employee);
  }

  private signJwt(user: { id: string; role: string; email: string | null; fullName: string; employee?: { msnv: string } | null }) {
    return this.jwt.sign({
      sub: user.id,
      role: user.role,
      email: user.email ?? "",
      fullName: user.fullName,
      linkedMsnv: user.employee?.msnv ?? null
    });
  }

  private ensureEmployeeActive(employee: { isActive?: boolean } | null | undefined) {
    if (employee && employee.isActive === false) {
      throw new ForbiddenException("Tai khoan da bi vo hieu hoa");
    }
  }
}
