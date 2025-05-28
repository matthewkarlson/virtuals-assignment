import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { ethers } from "hardhat";

export default buildModule("EasyV", (m) => {

  const easyv = m.contract("EasyV", [ethers.parseEther("1000000000")],{});

  return { easyv };
});