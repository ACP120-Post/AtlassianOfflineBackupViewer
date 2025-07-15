import { SAML } from '@node-saml/node-saml';

// Thin wrapper around @node-saml/node-saml so index.mjs only deals with our own config shape
// (saml-config.json) and never hand-rolls XML signature verification.
export class SamlLogin {
  constructor(config) {
    this.saml = new SAML({
      entryPoint: config.idpSsoUrl,
      issuer: config.issuer,
      callbackUrl: config.callbackUrl,
      idpCert: config.idpCert,
      wantAssertionsSigned: true,
      identifierFormat: config.identifierFormat || null,
    });
    this.groupAttribute = config.groupAttribute || null;
  }
  loginUrl() { return this.saml.getAuthorizeUrlAsync(); }
  async validate(body) {
    const { profile } = await this.saml.validatePostResponseAsync(body);
    const groups = this.groupAttribute && profile[this.groupAttribute]
      ? [].concat(profile[this.groupAttribute]).filter(Boolean) : [];
    return { externalId: profile.nameID, displayName: profile.displayName || profile.cn || profile.nameID, email: profile.email || profile.nameID, groups };
  }
}
