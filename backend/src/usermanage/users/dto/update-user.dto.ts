import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  /** Password of the currently logged-in user, required to authorize profile/role changes. */
  authorizationPassword?: string;
}
