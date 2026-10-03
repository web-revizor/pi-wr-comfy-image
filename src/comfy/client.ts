import { type ApiPrompt, type ObjectInfo, type UiWorkflow } from './types.js';

export class ComfyUnavailable extends Error {}

export class ComfyRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
  }
}

export interface HistoryEntry {
  status?: {
    status_str?: string;
    completed?: boolean;
    messages?: [string, Record<string, unknown>][];
  };
  outputs?: Record<
    string,
    { images?: { filename: string; subfolder: string; type: string }[] }
  >;
}

/** The ComfyUI HTTP API, as far as this package uses it. */
export class ComfyClient {
  constructor(readonly baseUrl: string) {}

  private async request(
    pathname: string,
    init?: RequestInit,
  ): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl.replace(/\/+$/, '')}${pathname}`, init);
    } catch {
      throw new ComfyUnavailable(
        `ComfyUI at ${this.baseUrl} is not responding - start it`,
      );
    }
    if (!res.ok) {
      const body: unknown = await res.json().catch(() => undefined);
      throw new ComfyRequestError(
        `${pathname} -> HTTP ${res.status}`,
        res.status,
        body,
      );
    }
    return res;
  }

  async objectInfo(): Promise<ObjectInfo> {
    return (await (await this.request('/object_info')).json()) as ObjectInfo;
  }

  /** Workflow files under `user/default/workflows`, relative paths with `/`. */
  async listWorkflows(): Promise<{ path: string; modified: number }[]> {
    const res = await this.request(
      '/api/userdata?dir=workflows&recurse=true&full_info=true',
    );
    const list = (await res.json()) as { path: string; modified: number }[];
    return list.map((f) => ({ ...f, path: f.path.replaceAll('\\', '/') }));
  }

  async readWorkflow(relPath: string): Promise<UiWorkflow> {
    const res = await this.request(
      `/api/userdata/${encodeURIComponent(`workflows/${relPath}`)}`,
    );
    return (await res.json()) as UiWorkflow;
  }

  /** Uploads an input image; returns the name to put into `LoadImage.image`. */
  async uploadImage(
    data: Buffer,
    filename: string,
    mimeType: string,
  ): Promise<string> {
    const form = new FormData();
    form.append(
      'image',
      new Blob([new Uint8Array(data)], { type: mimeType }),
      filename,
    );
    form.append('type', 'input');
    form.append('overwrite', 'true');
    const res = await this.request('/upload/image', {
      method: 'POST',
      body: form,
    });
    const body = (await res.json()) as { name: string; subfolder?: string };
    return body.subfolder ? `${body.subfolder}/${body.name}` : body.name;
  }

  async queuePrompt(prompt: ApiPrompt, promptId: string): Promise<void> {
    await this.request('/prompt', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt, prompt_id: promptId }),
    });
  }

  async history(promptId: string): Promise<HistoryEntry | undefined> {
    const res = await this.request(`/history/${promptId}`);
    const body = (await res.json()) as Record<string, HistoryEntry>;
    return body[promptId];
  }

  async view(image: {
    filename: string;
    subfolder: string;
    type: string;
  }): Promise<Buffer> {
    const q = new URLSearchParams(image);
    const res = await this.request(`/view?${q.toString()}`);
    return Buffer.from(await res.arrayBuffer());
  }

  /** Dequeues or interrupts this one job only; a finished id is a no-op. */
  async cancel(promptId: string): Promise<void> {
    await this.request(`/api/jobs/${promptId}/cancel`, { method: 'POST' });
  }
}
