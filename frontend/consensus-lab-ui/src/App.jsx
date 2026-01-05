import { useState } from "react";
import { ethers } from "ethers";
import { CONFIG } from "./config";
import { BLOCK_VOTING_ABI } from "./abi";

export default function App() {
  const [account, setAccount] = useState("");
  const [chainOk, setChainOk] = useState(true);

  const connectWallet = async () => {
    if (!window.ethereum) {
      alert("MetaMask not detected");
      return;
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const address = await signer.getAddress();
    const network = await provider.getNetwork();

    setAccount(address);
    setChainOk(Number(network.chainId) === CONFIG.chainId);
  };

  return (
    <div style={{ padding: 40, fontFamily: "system-ui" }}>
      <h1>Consensus Lab – Block Voting</h1>

      {!account ? (
        <button onClick={connectWallet}>Connect MetaMask</button>
      ) : (
        <>
          <p><b>Connected wallet:</b> {account}</p>
          {!chainOk && (
            <p style={{ color: "crimson" }}>
              Wrong network — switch MetaMask to chainId {CONFIG.chainId}
            </p>
          )}
        </>
      )}

      <hr />

      <p>
        RPC endpoint: <code>{CONFIG.rpcUrl}</code>
      </p>
      <p>
        Contract address: <code>{CONFIG.contractAddress}</code>
      </p>

      <p style={{ marginTop: 20 }}>
        Next: read contract state (validators, quorum, proposals).
      </p>
    </div>
  );
}