# JWT keys (dev)

RSA keypair used by `src/lib/auth/auth-service.ts` for RS256 signing
(`private.pem`) and verification (`public.pem`). These are the default key
paths — no env vars needed.

**Development only.** Anyone with this repo can mint valid tokens. For any
non-public deployment, regenerate the pair and keep it out of version
control:

```
node -e "const{generateKeyPairSync}=require('crypto');const fs=require('fs');const{privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});fs.writeFileSync('config/jwt/private.pem',privateKey.export({type:'pkcs8',format:'pem'}));fs.writeFileSync('config/jwt/public.pem',publicKey.export({type:'spki',format:'pem'}));"
```
