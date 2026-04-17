import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { RoleEnum } from "../../common/enums";

export class UpdateManagedUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  fullName?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(RoleEnum)
  preferredRole?: RoleEnum;
}
