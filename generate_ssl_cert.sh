echo Hostname is: $(hostname)
mkdir -p ssl
openssl req -nodes -new -x509 -keyout ssl/key.pem -out ssl/certificate.pem
