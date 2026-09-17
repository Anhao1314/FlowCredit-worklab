import { CredentialProvider } from "./harness.mjs";
const REF = "FLOWCREDIT_EPHEMERAL_POWER";
export class EphemeralCredentials extends CredentialProvider {
  constructor(ctx) {
    super(ctx);
    let secret = "";
    this.power = (value) => {
      secret = value;
    };
    this.clear = () => {
      secret = "";
    };
    this.hasPower = () => !!secret;
    this.contains = (text) => !!secret && text.includes(secret);
    this.resolve = async (ref) =>
      ref === REF && secret
        ? { value: secret, source: "process-memory" }
        : undefined;
  }
  async describe(ref) {
    return { configured: ref === REF && this.hasPower(), writable: false };
  }
  async set() {
    throw Error("PERSISTENCE_DISABLED");
  }
  async unset() {
    this.clear();
  }
  async readRecord() {
    return undefined;
  }
  async describeRecord() {
    return { configured: false, writable: false };
  }
  async listRecords() {
    return [];
  }
  async modifyRecord() {
    throw Error("PERSISTENCE_DISABLED");
  }
  async deleteRecord() {}
}
