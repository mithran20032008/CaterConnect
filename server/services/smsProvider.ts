export interface SmsSendResult {
  sent: boolean;
  provider: string;
  testCode?: string;
}

export interface SmsProvider {
  name: string;
  sendOtp(phone: string, code: string): Promise<SmsSendResult>;
}

export class TestModeSmsProvider implements SmsProvider {
  public name = 'test-mode';

  async sendOtp(_phone: string, code: string): Promise<SmsSendResult> {
    // No SMS is sent in test mode; code is returned to show in the amber test banner.
    return {
      sent: true,
      provider: this.name,
      testCode: code,
    };
  }
}

export const smsProvider: SmsProvider = new TestModeSmsProvider();
