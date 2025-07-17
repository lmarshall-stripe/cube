import { SigmaDriver } from '../src/SigmaDriver';
import nock from 'nock';

describe('SigmaDriver', () => {
  const apiKey = 'sk_test_fake';
  const apiBase = 'https://api.stripe.com';

  afterEach(() => {
    nock.cleanAll();
  });

  it('should construct', () => {
    const driver = new SigmaDriver({ apiKey });
    expect(driver).toBeInstanceOf(SigmaDriver);
  });

  it('should test connection', async () => {
    // Mock query run creation
    nock(apiBase)
      .post('/v1/sigma/query_runs')
      .reply(200, { id: 'qry_123', status: 'pending' });
    // Mock polling for completion
    nock(apiBase)
      .get('/v1/sigma/query_runs/qry_123')
      .twice()
      .reply(200, { id: 'qry_123', status: 'completed', result: { file: 'file_123' } });
    // Mock file metadata
    nock(apiBase)
      .get('/v1/files/file_123')
      .reply(200, { url: 'https://files.stripe.com/fake.csv' });
    // Mock file download
    nock('https://files.stripe.com')
      .get('/fake.csv')
      .reply(200, 'col1\n1\n');

    const driver = new SigmaDriver({ apiKey });
    await driver.testConnection();
  });

  it('should run a query and return results', async () => {
    nock(apiBase)
      .post('/v1/sigma/query_runs')
      .reply(200, { id: 'qry_456', status: 'pending' });
    nock(apiBase)
      .get('/v1/sigma/query_runs/qry_456')
      .twice()
      .reply(200, { id: 'qry_456', status: 'completed', result: { file: 'file_456' } });
    nock(apiBase)
      .get('/v1/files/file_456')
      .reply(200, { url: 'https://files.stripe.com/fake2.csv' });
    nock('https://files.stripe.com')
      .get('/fake2.csv')
      .reply(200, 'col1,col2\n1,foo\n2,bar\n');

    const driver = new SigmaDriver({ apiKey });
    const rows = await driver.query('SELECT 1', []);
    expect(rows).toEqual([
      { col1: '1', col2: 'foo' },
      { col1: '2', col2: 'bar' }
    ]);
  });
});
