import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("BondingCurveImplementation", (m) => {
  const bondingCurveImpl = m.contract("BondingCurve", [], {});

  return { bondingCurveImpl };
}); 