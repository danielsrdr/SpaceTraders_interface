export interface ContractTerms {
  deadline: string;
  payment: { onAccepted: number; onFulfilled: number };
  deliver: Array<{
    tradeSymbol: string;
    destinationSymbol: string;
    unitsRequired: number;
    unitsFulfilled?: number;
  }>;
}

export interface ContractData {
  id: string;
  factionSymbol: string;
  type: string;
  accepted: boolean;
  fulfilled?: boolean;
  expiration: string;
  deadlineToAccept: string;
  terms: ContractTerms;
  deliver?: ContractTerms['deliver'];
}

export interface ContractView {
  id: string;
  faction: string;
  type: string;
  accepted: boolean;
  fulfilled: boolean;
  expiration: string;
  deadline: string;
  paymentAccepted: number;
  paymentFulfill: number;
  tradeSymbol: string;
  destination: string;
  deliver: ContractTerms['deliver'];
}

export function mapContract(data: ContractData): ContractView {
  const deliver = data.terms?.deliver ?? data.deliver ?? [];
  return {
    id: data.id,
    faction: data.factionSymbol,
    type: data.type,
    accepted: data.accepted,
    fulfilled: data.fulfilled ?? false,
    expiration: data.expiration,
    deadline: data.deadlineToAccept,
    paymentAccepted: data.terms.payment.onAccepted,
    paymentFulfill: data.terms.payment.onFulfilled,
    tradeSymbol: deliver[0]?.tradeSymbol ?? '',
    destination: deliver[0]?.destinationSymbol ?? '',
    deliver,
  };
}
