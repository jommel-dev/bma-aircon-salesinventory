export class CreatePartsDto {
  brandId?: number;
  partsName: string;
  model?: string;
  partsCode?: string;
  srp?: number;
  discountPercentage?: number;
  discountedPrice?: number;
}

export class UpdatePartsDto {
  brandId?: number;
  partsName?: string;
  model?: string;
  partsCode?: string;
  srp?: number;
  discountPercentage?: number;
  discountedPrice?: number;
}