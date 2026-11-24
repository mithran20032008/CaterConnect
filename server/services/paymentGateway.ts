export interface PaymentTransferRequest {
  bookingId: number;
  amount: number;
  method: string;
  workerPhone: string;
}

export interface PaymentTransferResult {
  automatic: boolean;
  provider: string;
  reference: string;
  note: string;
}

export interface PaymentGateway {
  name: string;
  supportsAutomaticTransfer: boolean;
  recordPayment(req: PaymentTransferRequest): Promise<PaymentTransferResult>;
}

export class ManualPaymentGateway implements PaymentGateway {
  public name = 'manual-direct';
  public supportsAutomaticTransfer = false;

  async recordPayment(req: PaymentTransferRequest): Promise<PaymentTransferResult> {
    return {
      automatic: false,
      provider: this.name,
      reference: `MANUAL-${req.bookingId}-${Date.now()}`,
      note: 'Direct manual payment between organisation and worker. Agent commission: Rs 0.',
    };
  }
}

export const paymentGateway: PaymentGateway = new ManualPaymentGateway();
