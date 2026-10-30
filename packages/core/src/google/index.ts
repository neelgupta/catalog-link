import { ApiGoogleSource } from "./api-source";
import { authFor } from "./auth";
import { FakeGoogleSource } from "./fake-source";
import type { GoogleSource } from "./source";

export * from "./auth";
export * from "./links";
export * from "./source";

/** Development fixtures are on when GOOGLE_FAKE_DIR is set (never in production). */
export function fakeGoogleEnabled() {
  return Boolean(process.env.GOOGLE_FAKE_DIR) && process.env.NODE_ENV !== "production";
}

// Fixture IDs: spreadsheets "DEMO_…", Drive files/folders "demo-…". Everything else is real Google.
const isFakeSheet = (id: string) => id.startsWith("DEMO_");
const isFakeDrive = (id: string) => id.startsWith("demo-");

/**
 * Routes fixture IDs to local files and every other ID to the real Google APIs, so fixtures and
 * real sheets work side by side in development. The real client is only built when needed.
 */
class DevRoutingSource implements GoogleSource {
  private realSource?: GoogleSource;
  constructor(
    private readonly fake: GoogleSource,
    private readonly makeReal: () => GoogleSource,
  ) {}
  private real() {
    return (this.realSource ??= this.makeReal());
  }
  getSpreadsheet(id: string) {
    return isFakeSheet(id) ? this.fake.getSpreadsheet(id) : this.real().getSpreadsheet(id);
  }
  readValues(id: string, tab: string) {
    return isFakeSheet(id) ? this.fake.readValues(id, tab) : this.real().readValues(id, tab);
  }
  async listSpreadsheets() {
    let real: Awaited<ReturnType<GoogleSource["listSpreadsheets"]>> = [];
    try {
      real = await this.real().listSpreadsheets();
    } catch {
      /* no real Google account connected */
    }
    return [...(await this.fake.listSpreadsheets()), ...real];
  }
  listFolderImages(id: string) {
    return isFakeDrive(id) ? this.fake.listFolderImages(id) : this.real().listFolderImages(id);
  }
  getFile(id: string) {
    return isFakeDrive(id) ? this.fake.getFile(id) : this.real().getFile(id);
  }
  download(id: string) {
    return isFakeDrive(id) ? this.fake.download(id) : this.real().download(id);
  }
}

/** The GoogleSource for a client's sheet connection. */
export function googleSourceFor(connection: { mode: "OAUTH" | "SERVICE_ACCOUNT"; oauthRefreshTokenEnc: string | null }): GoogleSource {
  const real = () => new ApiGoogleSource(authFor(connection));
  if (fakeGoogleEnabled()) return new DevRoutingSource(new FakeGoogleSource(process.env.GOOGLE_FAKE_DIR!), real);
  return real();
}
