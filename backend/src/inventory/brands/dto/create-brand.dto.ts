export class CreateBrandDto {
  name: string;
  prefix?: string;
  type?: string;
  product_type_id?: number | null;
}
