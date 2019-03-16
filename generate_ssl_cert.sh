echo Host URL is: $(hostname).local (can be used as common name for certificate)
mkdir -p ssl
openssl req -nodes -new -x509 -days 365 -keyout ssl/key.pem -out ssl/certificate.pem