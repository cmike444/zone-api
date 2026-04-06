declare module "@cmike444/supply-and-demand-zones" {
  export interface SdkCandle {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }

  export interface SdkZone {
    proximal: number;
    distal: number;
    type: number;
    confidence: number;
    startTimestamp: number;
    endTimestamp: number;
  }

  export interface SupplyZone extends SdkZone {}
  export interface DemandZone extends SdkZone {}

  export function identifyZones(candles: SdkCandle[]): {
    supplyZones: SupplyZone[];
    demandZones: DemandZone[];
  };

  export function filterFreshZones(
    supplyZones: SupplyZone[],
    demandZones: DemandZone[],
  ): {
    supplyZones: SupplyZone[];
    demandZones: DemandZone[];
  };

  export enum ZONE_DIRECTION {
    SUPPLY = 0,
    DEMAND = 1,
  }

  export enum ZONE_TYPE {
    DROP_BASE_DROP = 0,
    RALLY_BASE_RALLY = 1,
    DROP_BASE_RALLY = 2,
    RALLY_BASE_DROP = 3,
  }
}
