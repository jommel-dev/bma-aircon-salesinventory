import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
export const ALLOW_OWNER_KEY = 'allowOwner';

// Decorator factory that can be used as @Permissions(...) 
export function Permissions(keys: string[], options?: { allowOwner?: boolean }) {
  return function (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    SetMetadata(PERMISSIONS_KEY, keys || [])(target, propertyKey, descriptor);
    if (options?.allowOwner === true) {
      SetMetadata(ALLOW_OWNER_KEY, true)(target, propertyKey, descriptor);
    }
    return descriptor;
  };
}
