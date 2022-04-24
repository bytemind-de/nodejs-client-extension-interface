#!/bin/bash
set -e
#
# make sure we are in the right folder
SCRIPT_PATH="$(realpath "$BASH_SOURCE")"
SCRIPT_FOLDER="$(dirname "$SCRIPT_PATH")"
SSL_FOLDER="$SCRIPT_FOLDER/ssl"
cd "$SCRIPT_FOLDER"
#
echo "Creating self-signed SSL certificate ..."
echo ""
echo "Host URL is: $(hostname -s).local (can be used as COMMON NAME for certificate)"
ip_adr=""
if [ -x "$(command -v ip)" ]; then
	ip_adr=$(ip a | grep -E 'eth0|wlan0' | sed -En 's/127.0.0.1//;s/.*inet (addr:)?(([0-9]*\.){3}[0-9]*).*/\2/p' | head -1)
elif [ -x "$(command -v ifconfig)" ]; then
	ip_adr=$(ifconfig | sed -En 's/127.0.0.1//;s/.*inet (addr:)?(([0-9]*\.){3}[0-9]*).*/\2/p' | head -1)
fi
if [ -z "$ip_adr" ]; then
	ip_adr="[IP]"
fi
echo "IP should be: $ip_adr"
echo ""
echo "NOTE: The following tool may or may not ask you several questions. In this case use:"
echo "'$(hostname -s).local' as 'common name' (your hostname). All other fields can be left blank."
echo ""
read -p "Press any key to continue"
mkdir -p "$SSL_FOLDER"
openssl req -nodes -new -x509 -days 3650 -newkey rsa:2048 -keyout "$SSL_FOLDER/key.pem" -out "$SSL_FOLDER/certificate.pem" \
	-subj "/CN=$(hostname -s).local" \
	-addext "subjectAltName=DNS:$(hostname -s).local,DNS:$ip_adr,DNS:localhost"
# subj options: "/C=DE/ST=NRW/L=Essen/O=SEPIA OA Framework/OU=DEV/CN=yourdomain.com"
openssl x509 -text -in "$SSL_FOLDER/certificate.pem" -noout | grep "Subject:"
openssl x509 -text -in "$SSL_FOLDER/certificate.pem" -noout | grep "DNS:"
echo ""
echo "Certificates created at: $SSL_FOLDER/"
echo "------------------------"
echo "DONE."
