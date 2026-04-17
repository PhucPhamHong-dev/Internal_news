import { IsEnum, IsString } from "class-validator";
import { RoleEnum } from "../../common/enums";

export class SetRoleDto {
  @IsString()
  userId!: string;

  @IsEnum(RoleEnum)
  role!: RoleEnum;
}
