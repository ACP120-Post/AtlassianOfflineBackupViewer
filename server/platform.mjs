export const PRODUCTS = ['confluence','jira'];
export function initPlatform(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS product_access(product TEXT PRIMARY KEY,enabled INTEGER NOT NULL);
    INSERT OR IGNORE INTO product_access VALUES('confluence',1),('jira',1);
    CREATE TABLE IF NOT EXISTS user_product_access(external_id TEXT,product TEXT,enabled INTEGER NOT NULL,PRIMARY KEY(external_id,product));
    CREATE TABLE IF NOT EXISTS jira_identity_mappings(backup_id TEXT,jira_user_key TEXT,external_id TEXT NOT NULL,PRIMARY KEY(backup_id,jira_user_key));`);
}
export function productAccess(db, identity) {
  return Object.fromEntries(db.prepare('SELECT * FROM product_access').all().map(r => [r.product, !!r.enabled && (!identity || db.prepare('SELECT enabled FROM user_product_access WHERE external_id=? AND product=?').get(identity.externalId,r.product)?.enabled !== 0)]));
}
export function assertProduct(db, identity, product) {
  if (!PRODUCTS.includes(product) || !productAccess(db,identity)[product]) throw Object.assign(new Error('Dieses Produkt ist für diese Installation oder Identität nicht freigeschaltet'),{status:403});
}
