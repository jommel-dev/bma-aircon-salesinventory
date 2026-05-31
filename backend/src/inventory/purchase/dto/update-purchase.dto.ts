import { PartialType } from '@nestjs/mapped-types';
import { BadRequestException } from '@nestjs/common';
import { CreatePurchaseDto } from './create-purchase.dto';

export class UpdatePurchaseDto extends PartialType(CreatePurchaseDto) {
	/**
	 * Validates ACM-specific rules on the update DTO.
	 * Applies the same validation rules as CreatePurchaseDto.validateAcm.
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
	static validateAcm(dto: UpdatePurchaseDto): void {
		CreatePurchaseDto.validateAcm(dto as unknown as CreatePurchaseDto);
	}

	/**
	 * Status guard: rejects update if PO status is not 'in-progress'.
	 * Throws BadRequestException if the current status does not allow editing.
	 *
	 * @param currentStatus - The current status of the purchase order from the database
	 */
	static validateStatusGuard(currentStatus: string): void {
		const normalized = String(currentStatus ?? '').trim().toLowerCase();
		if (normalized !== 'in-progress' && normalized !== 'in_progress') {
			throw new BadRequestException(
				`Purchase order cannot be edited in its current status '${normalized}'. Only orders with status 'in-progress' can be updated.`,
			);
		}
	}
}
