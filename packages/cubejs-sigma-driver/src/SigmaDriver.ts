import { PrestodbQuery } from '@cubejs-backend/schema-compiler';

import {
  DownloadQueryResultsOptions, DownloadQueryResultsResult,
  DriverCapabilities, DriverInterface,
  StreamOptions,
  StreamTableData,
  BaseDriver
} from '@cubejs-backend/base-driver';
import { getEnv, assertDataSource } from '@cubejs-backend/shared';
import axios from 'axios';
import csvParse from 'csv-parse/sync';

export type SigmaDriverConfiguration = {
  apiKey: string;
  dataSource?: string;
  pollTimeout?: number;
  queryTimeout?: number;
};

export class SigmaDriver extends BaseDriver implements DriverInterface {
  protected readonly config: SigmaDriverConfiguration;

  protected readonly apiKey: string;

  protected readonly apiBase: string = 'https://api.stripe.com/v1';

  public constructor(config: SigmaDriverConfiguration) {
    super();
    const dataSource = config.dataSource || assertDataSource('default');
    this.apiKey = config.apiKey || getEnv('sigmaApiKey', { dataSource });

    this.config = { ...config,
      apiKey: this.apiKey,
      pollTimeout: config.pollTimeout || 2000,
      queryTimeout: (
        config.queryTimeout ||
        getEnv('dbQueryTimeout', { dataSource })
      ) * 1000,
    };
  }

  public static getDefaultConcurrency() {
    return 1;
  }

  public static dialectClass() {
    return PrestodbQuery;
  }

  public async testConnection(): Promise<void> {
    await this.query('SELECT 1', []);
  }

  public async query(query: string, values: unknown[]): Promise<any[]> {
    // Support positional parameterized queries by interpolating values
    const interpolateParams = (sql: string, params: unknown[]): string => {
      let i = 0;
      return sql.replace(/\?/g, () => {
        if (i >= params.length) throw new Error('Not enough parameters provided for SQL query');
        const val = params[i++];
        if (val === null || val === undefined) return 'NULL';
        if (typeof val === 'number' || typeof val === 'boolean') return val.toString();
        if (typeof val === 'string') {
          // Escape single quotes by doubling them
          return `'${val.replace(/'/g, "''")}'`;
        }
        throw new Error(`Unsupported parameter type: ${typeof val}`);
      });
    };
    let sql = query;
    if (values && values.length > 0) {
      sql = interpolateParams(query, values);
    }
    // 1. Submit query
    const run = await this.createQueryRun(sql);
    // 2. Poll for completion
    const completedRun = await this.pollQueryRun(run.id);
    if (completedRun.status !== 'completed' && completedRun.status !== 'succeeded' || !completedRun.result || !completedRun.result.file) {
      throw new Error(`Sigma query failed or did not return a result file. Status: ${completedRun.status}`);
    }
    // 3. Download and parse result file
    const rows = await this.downloadAndParseResultFile(completedRun.result.file);
    return rows;
  }

  private async createQueryRun(sql: string): Promise<any> {
    const url = `${this.apiBase}/sigma/query_runs`;
    const payload = new URLSearchParams({ sql });
    console.log('[SigmaDriver] POST', url, 'Payload:', sql);
    try {
      const response = await axios.post(
        url,
        payload,
        {
          auth: { username: this.apiKey, password: '' },
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }
      );
      console.log('[SigmaDriver] Response:', response.status, JSON.stringify(response.data).slice(0, 500));
      return response.data;
    } catch (error: any) {
      console.error('[SigmaDriver] Error in createQueryRun:', error?.response?.status, error?.response?.data || error);
      throw error;
    }
  }

  private async pollQueryRun(id: string): Promise<any> {
    const url = `${this.apiBase}/sigma/query_runs/${id}`;
    const start = Date.now();
    while (true) {
      console.log('[SigmaDriver] GET', url);
      try {
        const response = await axios.get(
          url,
          { auth: { username: this.apiKey, password: '' } }
        );
        console.log('[SigmaDriver] pollQueryRun Response:', response.status, JSON.stringify(response.data).slice(0, 500));
        const run = response.data;
        // TODO: sigma api docs say 'completed' but the actual status is 'succeeded'
        if (['completed', 'succeeded', 'error'].includes(run.status)) {
          return run;
        }
        if (Date.now() - start > (this.config.queryTimeout || 60000)) {
          throw new Error('Sigma query run timed out');
        }
        await new Promise((r) => setTimeout(r, this.config.pollTimeout));
      } catch (error: any) {
        console.error('[SigmaDriver] Error in pollQueryRun:', error?.response?.status, error?.response?.data || error);
        throw error;
      }
    }
  }

  private async downloadAndParseResultFile(fileId: string): Promise<any[]> {
    // Get file download URL
    const fileUrl = `${this.apiBase}/files/${fileId}`;
    console.log('[SigmaDriver] GET', fileUrl);
    try {
      const fileResp = await axios.get(
        fileUrl,
        { auth: { username: this.apiKey, password: '' } }
      );
      console.log('[SigmaDriver] downloadAndParseResultFile fileResp:', fileResp.status, JSON.stringify(fileResp.data).slice(0, 500));
      const { url } = fileResp.data;
      if (!url) throw new Error('No download URL for Sigma result file');
      // Download CSV
      console.log('[SigmaDriver] GET (CSV)', url);
      const csvResp = await axios.get(url, { responseType: 'text', auth: { username: this.apiKey, password: '' } });
      console.log('[SigmaDriver] CSV download status:', csvResp.status, 'length:', csvResp.data.length);
      // Parse CSV
      const records = csvParse.parse(csvResp.data, { columns: true, skip_empty_lines: true });
      console.log('[SigmaDriver] Parsed records count:', records.length);
      return records;
    } catch (error: any) {
      console.error('[SigmaDriver] Error in downloadAndParseResultFile:', error?.response?.status, error?.response?.data || error);
      throw error;
    }
  }

  public downloadQueryResults(query: string, values: unknown[], options: DownloadQueryResultsOptions): Promise<DownloadQueryResultsResult> {
    return super.downloadQueryResults(query, values, options);
  }

  public informationSchemaQuery() {
    return super.informationSchemaQuery();
  }

  public stream(query: string, values: unknown[], _options: StreamOptions): Promise<StreamTableData> {
    throw new Error('Not implemented: stream');
  }

  public capabilities(): DriverCapabilities {
    return {};
  }
}
