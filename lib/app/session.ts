/* The session of an exported app: the tokens a sign-in gave, kept where the platform keeps secrets (sessionStorage on the
 * web, SecureStore in React Native, Taro's storage in a mini-program: injected as a `TokenStorage`), and a transport
 * that puts the token on every call that needs one, keeps the tokens a sign-in, a refresh and a sign-out give or take,
 * and on a 401 trades the refresh token for a new one once before it ends the session and says so (the app then goes
 * to its sign-in screen). The same rules as the preview's engine (lib/bindings/runtime.ts `call`). */

import type { HttpMethod, Transport, TransportRequest, TransportResponse } from "../api/transport";
import { Store } from "./store";

/** where the tokens are kept between visits; any of its calls may answer later (a promise) */
export type TokenStorage = {
  get(key: string): string | null | undefined | Promise<string | null | undefined>;
  set(key: string, value: string): void | Promise<void>;
  remove(key: string): void | Promise<void>;
};

/** tokens kept in memory only: gone when the app is closed */
export function memoryStorage(): TokenStorage {
  const kept = new Map<string, string>();
  return { get: (k) => kept.get(k) ?? null, set: (k, v) => void kept.set(k, v), remove: (k) => void kept.delete(k) };
}

export type Session = { token: string; refreshToken?: string; user?: unknown };

export type SessionState = {
  session: Session | null;
  /** the back end counts the app as signed in without a token (the mocks' session starts so unless its scenario says
   *  otherwise); a sign-out or a 401 ends it */
  presumed: boolean;
  /** what the storage held has been read */
  restored: boolean;
};

/** how a token rides on a call: a header (with a prefix such as "Bearer "), or a query parameter */
export type TokenPlacement = { header?: string; prefix?: string; query?: string };

/** an operation the session calls by itself: its id, method and path */
export type AuthOperation = { operationId: string; method: HttpMethod; path: string };

/** What the session needs of the contract (generated from it): which operations sign in, refresh and sign out, the
 *  names of the token fields, and how each operation's token rides (null for one anyone may call). */
export type AuthConfig = {
  login?: string;
  refresh?: AuthOperation;
  logout?: AuthOperation;
  /** the sign-in answer's token field; "accessToken" */
  tokenField?: string;
  /** its refresh token field; "refreshToken" */
  refreshTokenField?: string;
  security: Readonly<Record<string, TokenPlacement | null>>;
  /** how the token rides on a call to an operation `security` does not list (a call the contract does not name) */
  fallback?: TokenPlacement | null;
};

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** the session a sign-in's answer starts: its token, its refresh token, and the user (its `user`, else the rest of it) */
export function sessionOf(body: unknown, auth: Pick<AuthConfig, "tokenField" | "refreshTokenField"> | undefined): Session | null {
  const tf = auth?.tokenField ?? "accessToken";
  const rf = auth?.refreshTokenField ?? "refreshToken";
  const token = isRecord(body) ? body[tf] : undefined;
  if (typeof token !== "string" || !token) return null;
  const refresh = isRecord(body) ? body[rf] : undefined;
  const user = isRecord(body) ? (isRecord(body.user) ? body.user : Object.fromEntries(Object.entries(body).filter(([k]) => k !== tf && k !== rf))) : undefined;
  return { token, ...(typeof refresh === "string" ? { refreshToken: refresh } : {}), ...(user !== undefined ? { user } : {}) };
}

/** The session, kept in a store and in the storage given. */
export class SessionStore extends Store<SessionState> {
  private readonly storage?: TokenStorage;
  private readonly key: string;
  readonly ready: Promise<void>;

  constructor(o: { storage?: TokenStorage; key?: string; presumed?: boolean } = {}) {
    super({ session: null, presumed: !!o.presumed, restored: !o.storage });
    this.storage = o.storage;
    this.key = o.key ?? "m3e-session";
    this.ready = this.restore();
  }

  /** reads back what a sign-in kept; what cannot be read is no session */
  private async restore(): Promise<void> {
    if (!this.storage) return;
    let session: Session | null = null;
    try {
      const text = await this.storage.get(this.key);
      const kept: unknown = text ? JSON.parse(text) : null;
      if (isRecord(kept) && typeof kept.token === "string" && kept.token) session = { token: kept.token, ...(typeof kept.refreshToken === "string" ? { refreshToken: kept.refreshToken } : {}), ...(kept.user !== undefined ? { user: kept.user } : {}) };
    } catch {
      /* a storage that fails or holds something else: signed out */
    }
    /* a sign-in while it was being read wins */
    this.set((s) => ({ ...s, session: s.session ?? session, restored: true }));
  }

  private keep(session: Session | null) {
    if (!this.storage) return;
    try {
      void Promise.resolve(session ? this.storage.set(this.key, JSON.stringify(session)) : this.storage.remove(this.key)).catch(() => {});
    } catch {
      /* the session still holds for as long as the app is open */
    }
  }

  get signedIn(): boolean {
    const s = this.get();
    return !!s.session || s.presumed;
  }

  get token(): string | undefined {
    return this.get().session?.token;
  }

  signIn(session: Session) {
    this.set((s) => ({ ...s, session, restored: true }));
    this.keep(session);
  }

  /** new tokens for the session there is (a refresh) */
  update(tokens: { token: string; refreshToken?: string }) {
    const was = this.get().session;
    if (!was) return;
    const session = { ...was, token: tokens.token, ...(tokens.refreshToken ? { refreshToken: tokens.refreshToken } : {}) };
    this.set((s) => ({ ...s, session }));
    this.keep(session);
  }

  signOut() {
    this.set((s) => (s.session || s.presumed ? { ...s, session: null, presumed: false } : s));
    this.keep(null);
  }

  /** starts over: no session, signed in without a token or not as `presumed` says (a new session of the mocks) */
  reset(presumed: boolean) {
    this.set({ session: null, presumed, restored: true });
    this.keep(null);
  }
}

/** the token placement of a call, by its operation */
const placementOf = (auth: AuthConfig | undefined, request: TransportRequest): TokenPlacement | null => {
  if (!auth) return { header: "Authorization", prefix: "Bearer " };
  const op = request.operationId;
  if (op !== undefined && Object.prototype.hasOwnProperty.call(auth.security, op)) return auth.security[op] ?? null;
  return auth.fallback === undefined ? { header: "Authorization", prefix: "Bearer " } : auth.fallback;
};

/** the request with the session's token on it, where its operation takes one */
function withToken(request: TransportRequest, token: string | undefined, place: TokenPlacement | null): TransportRequest {
  if (!token || !place) return request;
  if (place.header) return { ...request, headers: { ...request.headers, [place.header]: `${place.prefix ?? ""}${token}` } };
  if (place.query) return { ...request, query: { ...request.query, [place.query]: token } };
  return request;
}

/** A transport over another (`inner`, asked each time, so it can be swapped) that carries the session: see the top of
 *  this file. `onUnauthorized` hears of a 401 no refresh could mend, after the session has ended. */
export function sessionTransport(o: { inner: () => Transport; session: SessionStore; auth?: AuthConfig; onUnauthorized?: (request: TransportRequest) => void }): Transport {
  const { session, auth } = o;
  let refreshing: Promise<boolean> | null = null;

  /** trades the refresh token for a new access token, one trade at a time; whether it worked */
  const refresh = (): Promise<boolean> => {
    const was = session.get().session;
    const op = auth?.refresh;
    if (!was?.refreshToken || !op) return Promise.resolve(false);
    refreshing ??= (async () => {
      try {
        const res = await o.inner().request({ operationId: op.operationId, method: op.method, path: op.path, body: { [auth?.refreshTokenField ?? "refreshToken"]: was.refreshToken } });
        const next = res.status >= 200 && res.status < 300 ? sessionOf(res.body, auth) : null;
        if (!next) return false;
        session.update({ token: next.token, ...(next.refreshToken ? { refreshToken: next.refreshToken } : {}) });
        return true;
      } catch {
        return false;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  };

  const send = async (request: TransportRequest, retried: boolean): Promise<TransportResponse> => {
    const place = placementOf(auth, request);
    const token = session.token;
    const res = await o.inner().request(withToken(request, token, place));
    const op = request.operationId;
    if (res.status >= 200 && res.status < 300) {
      if (op !== undefined && op === auth?.login) {
        const started = sessionOf(res.body, auth);
        if (started) session.signIn(started);
      }
      if (op !== undefined && op === auth?.logout?.operationId) session.signOut();
      if (op !== undefined && op === auth?.refresh?.operationId) {
        const next = sessionOf(res.body, auth);
        if (next) session.update(next);
      }
      return res;
    }
    if (res.status !== 401 || (op !== undefined && op === auth?.login)) return res;
    /* a token another call has refreshed meanwhile is tried before trading again */
    if (!retried && token && session.token && session.token !== token) return send(request, true);
    if (!retried && (await refresh())) return send(request, true);
    session.signOut();
    o.onUnauthorized?.(request);
    return res;
  };

  return { request: (request) => send(request, false) };
}
