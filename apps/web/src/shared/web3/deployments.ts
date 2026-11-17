import type { Address } from "@agentshield/shared";

/**
 * The real Fuji deployment (public addresses), mirrored from packages/contracts/deployments/fuji.json so the web can
 * show and use them without the server. deployments.test.ts fails if the two drift apart.
 */
export const FUJI_DEPLOYMENT = {
  chainId: 43113,
  factory: "0x16753E4e9e0F5C843838d6A745AEBc27d5b04D87",
  usdc: "0x99b583DC1f12668e1274261B952acD9398f3835F",
  wavax: "0x88B55FbE883231E073A820061EDE453d2843fcc1",
  router: "0xd7f655E3376cE2D7A2b08fF01Eb3B1023191A901",
  pair: "0xf981FE08994aA96389FfD6BF2216647763cBC350",
  agent: "0x9A478E17cfE33c98e5E74B4d744d249526c9be18",
  publicSafe: "0xB1FfC49550867538A1a10dd3e656C226cA41964b",
  publicModule: "0x796f307aE71C7469fA5048CBfA166af21C03d4B7",
  stageSafe: "0xcA435Ab856EDdD8c15b83D16672230b916737A8f",
  stageModule: "0xd7B3D84C9Ff9370AC3F5715Df36C0375DC7F7a99",
} as const satisfies Record<string, Address | number>;
