import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { OAuth2Client } from "google-auth-library";
import { RoleEnum } from "../common/enums";
import { PrismaService } from "../prisma/prisma.service";
import { hashPassword, verifyPassword } from "./password.util";

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

    let user;

    if (isAdmin) {
      const existingAdmin =
        (await this.prisma.user.findUnique({
          where: { googleSub: payload.sub },
          include: { employee: true }
        })) ||
        (await this.prisma.user.findUnique({
          where: { email },
          include: { employee: true }
        }));

      if (existingAdmin) {
        this.ensureEmployeeActive(existingAdmin.employee);
        user = await this.prisma.user.update({
          where: { id: existingAdmin.id },
          data: {
            email,
            googleSub: payload.sub,
            fullName: payload.name,
            avatarUrl: payload.picture || null,
            role: RoleEnum.ADMIN,
            canPost: true,
            canManageEmployees: true
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
            role: RoleEnum.ADMIN,
            canPost: true,
            canManageEmployees: true
          },
          include: { employee: true }
        });
      }
    } else {
      const employee = await this.prisma.employeeMaster.findUnique({
        where: { loginEmail: email },
        include: { linkedUser: { include: { employee: true } } }
      });

      if (!employee) {
        throw new UnauthorizedException("Ban khong co quyen dang nhap qua Google. Vui long lien he voi Ninh de duoc cap tai khoan.");
      }
      if (!employee.isActive) {
        throw new ForbiddenException("Tai khoan da bi khoa");
      }

      const existingUser =
        employee.linkedUser ||
        (await this.prisma.user.findUnique({
          where: { googleSub: payload.sub },
          include: { employee: true }
        })) ||
        (await this.prisma.user.findUnique({
          where: { email },
          include: { employee: true }
        }));

      if (existingUser?.employeeId && existingUser.employeeId !== employee.id) {
        throw new UnauthorizedException("Ban khong co quyen dang nhap qua Google. Vui long lien he voi Ninh de duoc cap tai khoan.");
      }

      const nextRole = this.resolveUserRole(employee.canPost, employee.canManageEmployees);
      if (existingUser) {
        user = await this.prisma.user.update({
          where: { id: existingUser.id },
          data: {
            employeeId: employee.id,
            email,
            googleSub: payload.sub,
            fullName: employee.fullName,
            avatarUrl: payload.picture || null,
            role: existingUser.role === RoleEnum.ADMIN ? RoleEnum.ADMIN : nextRole,
            canPost: existingUser.role === RoleEnum.ADMIN ? existingUser.canPost : employee.canPost,
            canManageEmployees: existingUser.role === RoleEnum.ADMIN ? existingUser.canManageEmployees : employee.canManageEmployees
          },
          include: { employee: true }
        });
      } else {
        user = await this.prisma.user.create({
          data: {
            employeeId: employee.id,
            email,
            googleSub: payload.sub,
            fullName: employee.fullName,
            avatarUrl: payload.picture || null,
            role: nextRole,
            canPost: employee.canPost,
            canManageEmployees: employee.canManageEmployees
          },
          include: { employee: true }
        });
      }
    }

    return {
      token: this.signJwt(user),
      linked: this.isLinked(user.role, user.employee),
      profile: this.serializeProfile(user)
    };
  }

  async linkMsnv(userId: string, msnv: string) {
    void userId;
    void msnv;
    throw new ForbiddenException("Khong con ho tro tu lien ket MSNV sau khi dang nhap Google");
  }

  async employeeLogin(msnv: string, password: string) {
    const employee = await this.prisma.employeeMaster.findUnique({
      where: { msnv },
      include: { linkedUser: { include: { employee: true } } }
    });

    if (!employee || !employee.passwordHash) {
      throw new UnauthorizedException("MSNV hoac mat khau khong dung");
    }
    if (!employee.isActive) {
      throw new ForbiddenException("Tai khoan da bi vo hieu hoa");
    }
    if (!verifyPassword(password, employee.passwordHash)) {
      throw new UnauthorizedException("MSNV hoac mat khau khong dung");
    }

    const user = employee.linkedUser
      ? await this.prisma.user.update({
          where: { id: employee.linkedUser.id },
          data: {
            fullName: employee.fullName,
            role: employee.linkedUser.role === RoleEnum.ADMIN ? RoleEnum.ADMIN : this.resolveUserRole(employee.canPost, employee.canManageEmployees),
            canPost: employee.linkedUser.role === RoleEnum.ADMIN ? employee.linkedUser.canPost : employee.canPost,
            canManageEmployees: employee.linkedUser.role === RoleEnum.ADMIN ? employee.linkedUser.canManageEmployees : employee.canManageEmployees
          },
          include: { employee: true }
        })
      : await this.prisma.user.create({
          data: {
            fullName: employee.fullName,
            role: this.resolveUserRole(employee.canPost, employee.canManageEmployees),
            employeeId: employee.id,
            canPost: employee.canPost,
            canManageEmployees: employee.canManageEmployees
          },
          include: { employee: true }
        });

    return {
      token: this.signJwt(user),
      linked: true,
      mustChangePassword: employee.mustChangePassword,
      profile: this.serializeProfile(user)
    };
  }

  async changePassword(userId: string, newPassword: string, currentPassword?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { employee: true }
    });
    if (!user?.employee) {
      throw new BadRequestException("Tai khoan chua lien ket MSNV");
    }
    if (!user.employee.isActive) {
      throw new ForbiddenException("Tai khoan da bi vo hieu hoa");
    }
    if (!user.employee.mustChangePassword && !verifyPassword(currentPassword ?? "", user.employee.passwordHash)) {
      throw new UnauthorizedException("Mat khau hien tai khong dung");
    }

    const updatedEmployee = await this.prisma.employeeMaster.update({
      where: { id: user.employee.id },
      data: {
        passwordHash: hashPassword(newPassword),
        temporaryPasswordPreview: null,
        mustChangePassword: false,
        activatedAt: user.employee.activatedAt ?? new Date(),
        passwordChangedAt: new Date()
      }
    });

    return {
      ok: true,
      mustChangePassword: updatedEmployee.mustChangePassword
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
      canPost: user.canPost,
      canManageEmployees: user.canManageEmployees,
      linkedMsnv: user.employee?.msnv ?? null,
      linked: this.isLinked(user.role, user.employee),
      mustChangePassword: user.employee?.mustChangePassword ?? false,
      themeKey: user.themeKey
    };
  }

  private serializeProfile(user: {
    id: string;
    email: string | null;
    fullName: string;
    avatarUrl: string | null;
    role: string;
    canPost: boolean;
    canManageEmployees: boolean;
    themeKey: string;
    employee?: { msnv: string; mustChangePassword?: boolean } | null;
  }) {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      canPost: user.canPost,
      canManageEmployees: user.canManageEmployees,
      linkedMsnv: user.employee?.msnv ?? null,
      linked: this.isLinked(user.role, user.employee),
      mustChangePassword: user.employee?.mustChangePassword ?? false,
      themeKey: user.themeKey
    };
  }

  private isLinked(role: string, employee: { msnv: string } | null | undefined) {
    if (role === RoleEnum.ADMIN) {
      return true;
    }
    return Boolean(employee);
  }

  private signJwt(user: {
    id: string;
    role: string;
    canPost: boolean;
    canManageEmployees: boolean;
    email: string | null;
    fullName: string;
    employee?: { msnv: string } | null;
  }) {
    return this.jwt.sign({
      sub: user.id,
      role: user.role,
      canPost: user.canPost,
      canManageEmployees: user.canManageEmployees,
      email: user.email ?? "",
      fullName: user.fullName,
      linkedMsnv: user.employee?.msnv ?? null
    });
  }

  private resolveUserRole(canPost: boolean, canManageEmployees: boolean) {
    if (canPost) return RoleEnum.WRITER;
    if (canManageEmployees) return RoleEnum.HR_MANAGER;
    return RoleEnum.VIEWER;
  }

  private ensureEmployeeActive(employee: { isActive?: boolean } | null | undefined) {
    if (employee && employee.isActive === false) {
      throw new ForbiddenException("Tai khoan da bi vo hieu hoa");
    }
  }
}
