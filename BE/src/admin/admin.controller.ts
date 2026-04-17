import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RoleEnum } from "../common/enums";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { CreatePostDto } from "../posts/dto/create-post.dto";
import { AdminService } from "./admin.service";
import { BroadcastDto } from "./dto/broadcast.dto";
import { CreateManagedUserDto } from "./dto/create-managed-user.dto";
import { UpdateManagedUserDto } from "./dto/update-managed-user.dto";

@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleEnum.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post("notifications/broadcast")
  broadcast(@Body() body: BroadcastDto) {
    return this.adminService.broadcast(body.message.trim());
  }

  @Get("comments/:commentId/identity")
  identity(@Param("commentId") commentId: string) {
    return this.adminService.getCommentIdentity(commentId);
  }

  @Get("users")
  listUsers(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("q") q?: string,
    @Query("filter") filter?: "ALL" | "PENDING" | "LINKED" | "ACTIVE" | "DISABLED"
  ) {
    return this.adminService.listUsers({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      q,
      filter
    });
  }

  @Post("users")
  createUser(@Body() body: CreateManagedUserDto) {
    return this.adminService.createUser(body.msnv.trim().toUpperCase(), body.fullName.trim());
  }

  @Patch("users/:employeeId")
  updateUser(@Param("employeeId") employeeId: string, @Body() body: UpdateManagedUserDto) {
    return this.adminService.updateUser(employeeId, {
      fullName: body.fullName?.trim(),
      isActive: body.isActive,
      preferredRole: body.preferredRole
    });
  }

  @Post("users/:employeeId/unlink-gmail")
  unlinkGmail(@Param("employeeId") employeeId: string) {
    return this.adminService.unlinkGmail(employeeId);
  }

  @Post("posts/as-user/:employeeId")
  composeAsUser(@Param("employeeId") employeeId: string, @Body() body: CreatePostDto) {
    return this.adminService.composeAsUser(employeeId, body);
  }
}
