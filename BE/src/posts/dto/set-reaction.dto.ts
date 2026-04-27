import { IsEnum } from "class-validator";
import { ReactionTypeEnum } from "../../common/enums";

export class SetReactionDto {
  @IsEnum(ReactionTypeEnum)
  type!: ReactionTypeEnum;
}
