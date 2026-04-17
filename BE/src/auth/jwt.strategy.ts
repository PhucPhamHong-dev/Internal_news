import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>("JWT_SECRET", "replace_me")
    });
  }

  async validate(payload: { sub: string; role: string; email: string; fullName: string; linkedMsnv: string | null }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { employee: true }
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    if (user.employee && user.employee.isActive === false) {
      throw new ForbiddenException("Tai khoan da bi vo hieu hoa");
    }
    return {
      sub: user.id,
      role: user.role,
      email: user.email ?? "",
      fullName: user.fullName,
      linkedMsnv: user.employee?.msnv ?? null
    };
  }
}
