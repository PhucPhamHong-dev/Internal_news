import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RoleEnum } from "./enums";
import { ROLES_KEY } from "./roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<RoleEnum[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest();
    if (user.role === RoleEnum.ADMIN) {
      return true;
    }

    return requiredRoles.some((requiredRole) => {
      if (requiredRole === RoleEnum.ADMIN) return user.role === RoleEnum.ADMIN;
      if (requiredRole === RoleEnum.WRITER) return Boolean(user.canPost);
      if (requiredRole === RoleEnum.HR_MANAGER) return Boolean(user.canManageEmployees);
      if (requiredRole === RoleEnum.VIEWER) return true;
      return requiredRole === (user.role as RoleEnum);
    });
  }
}
