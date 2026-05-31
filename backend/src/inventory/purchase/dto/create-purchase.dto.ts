import { BadRequestException } from '@nestjs/common';

export class CreatePurchaseVendorDto {
	name: string;
	address?: string;
	contact_person?: string;
	contact_number?: string;
}

export class CreatePurchasePaymentDetailsDto {
	method?: string;
	terms?: string;
	amount?: number;
	termsDueDate?: string | null;
	status?: 'unpaid' | 'paid' | 'partial' | 'overdue';
	paymentDate?: string | null;
	bankName?: string;
	referenceNo?: string;
	checkNo?: string;
	chequeDate?: string | null;
	issuedBy?: string;
	downPayment?: number;
}

export class CreatePurchaseUnitTypeQtyDto {
	unitType?: string;
	qty?: number;
	label?: string;
	value?: number;
}

export class CreatePurchaseProductItemDto {
	transType: 'purchase' | 'sales' | string;
	productId?: string | number;
	capacityId?: string | number;
	unitPrice?: string | number;
	sellPrice?: string | number;
	discountPrice?: string | number;
	unitTypesQty?: CreatePurchaseUnitTypeQtyDto[];
	serialNumbers?: Record<string, unknown>;
	totalSetQty?: number;
	purchaseId?: number | null;
	salesId?: number | null;

	// ACM (Aircon Materials) specific fields
	materialId?: string | number;
	materialName?: string;
	materialCode?: string;
	materialUnit?: string;
	materialBrandId?: string | number;
	materialBrandName?: string;

	// ACP (Aircon Parts) specific fields
	partId?: string | number;
	partsName?: string;
	partsCode?: string;
	partsModel?: string;
	partsBrandId?: string | number;
	partsBrandName?: string;
}

export class CreatePurchaseDto {
	poNumber?: string;
	poType?: 'ACU' | 'ACP' | 'ACM'; // ACU=Aircon Unit, ACP=Aircon Parts, ACM=Aircon Materials
	vendorId?: string;
	vendor?: CreatePurchaseVendorDto;
	paymentDetails?:
		| CreatePurchasePaymentDetailsDto
		| CreatePurchasePaymentDetailsDto[];
	productItems: CreatePurchaseProductItemDto[];
	totalAmount?: number;
	status?: string;
	purchaseStatus?: string;
	branchId?: number;

	/**
	 * Validates ACM-specific rules on the DTO.
	 * Throws BadRequestException with field path of first invalid item if validation fails.
	 *
	 * Validation rules (applied when poType === 'ACM'):
	 * - productItems must be a non-empty array
	 * - Each item: unitPrice in [0.01, 999999.99]
	 * - Each item: discountPrice in [0, 999999.99]
	 * - Each item: totalSetQty must be integer in [1, 999999]
	 * - Each ACM item must have materialId or non-empty materialName
	 * - vendorId or vendor.name (non-empty) is required
	 */
	static validateAcm(dto: CreatePurchaseDto): void {
		const poType = String(dto.poType ?? '').trim().toUpperCase();
		if (poType !== 'ACM') {
			return;
		}

		// Validate productItems is a non-empty array
		const productItems = Array.isArray(dto.productItems) ? dto.productItems : [];
		if (productItems.length === 0) {
			throw new BadRequestException(
				'productItems: At least one product item is required',
			);
		}

		// Validate vendor: vendorId OR vendor.name required
		const vendorId = String(dto.vendorId ?? '').trim();
		const vendorName = String(dto.vendor?.name ?? '').trim();
		if (!vendorId && !vendorName) {
			throw new BadRequestException(
				'vendorId or vendor.name: Vendor identification is required',
			);
		}

		// Validate each product item
		for (const [index, item] of productItems.entries()) {
			const transType = String(item.transType ?? 'purchase').trim().toLowerCase();
			if (transType !== 'purchase') {
				continue;
			}

			// Material identification: materialId or non-empty materialName
			const materialId = item.materialId !== undefined && item.materialId !== null && item.materialId !== ''
				? Number(item.materialId)
				: null;
			const materialName = String(item.materialName ?? '').trim();

			if ((!materialId || !Number.isFinite(materialId)) && !materialName) {
				throw new BadRequestException(
					`productItems[${index}].materialName: Material identification is required for ACM items`,
				);
			}

			// unitPrice validation: [0.01, 999999.99]
			const unitPrice = item.unitPrice !== undefined && item.unitPrice !== null && item.unitPrice !== ''
				? Number(item.unitPrice)
				: null;
			if (unitPrice !== null) {
				if (!Number.isFinite(unitPrice) || unitPrice < 0.01 || unitPrice > 999999.99) {
					throw new BadRequestException(
						`productItems[${index}].unitPrice: Unit price must be between 0.01 and 999,999.99`,
					);
				}
			}

			// discountPrice validation: [0, 999999.99]
			const discountPrice = item.discountPrice !== undefined && item.discountPrice !== null && item.discountPrice !== ''
				? Number(item.discountPrice)
				: null;
			if (discountPrice !== null) {
				if (!Number.isFinite(discountPrice) || discountPrice < 0 || discountPrice > 999999.99) {
					throw new BadRequestException(
						`productItems[${index}].discountPrice: Discount price must be between 0 and 999,999.99`,
					);
				}
			}

			// totalSetQty validation: integer in [1, 999999]
			const totalSetQty = item.totalSetQty !== undefined && item.totalSetQty !== null
				? Number(item.totalSetQty)
				: null;
			if (totalSetQty === null || !Number.isFinite(totalSetQty)) {
				throw new BadRequestException(
					`productItems[${index}].totalSetQty: Quantity is required and must be between 1 and 999,999`,
				);
			}
			if (!Number.isInteger(totalSetQty)) {
				throw new BadRequestException(
					`productItems[${index}].totalSetQty: Quantity must be a whole number`,
				);
			}
			if (totalSetQty < 1 || totalSetQty > 999999) {
				throw new BadRequestException(
					`productItems[${index}].totalSetQty: Quantity must be between 1 and 999,999`,
				);
			}
		}
	}
}
