#!/bin/bash

# put your api endpoint coming from the cdk deploy output 
API_GATEWAY_ENDPOINT="<YOUR_API_GATEWAY_ENDPOINT>"
ELEMENT="test-figure"
ELEMENT_NAME="$ELEMENT.png"
ELEMENT_PATH="../../img/sample/$ELEMENT_NAME"
ELEMENT_RESULT="$ELEMENT.mp3"
ELEMENT_PATH_RESULT="../../img/sample/$ELEMENT_RESULT"

if [ -z "$API_GATEWAY_ENDPOINT" ]
then

    echo "Setup your API Gateway endpoint given by the cdk deploy output first!"

else

    # presigned url for put
    echo "Getting the presigned url for upload..." 
    PRESIGNED_URL=$(curl -X POST -m 5 -f -s -d "{\"object_key\": \"$ELEMENT_NAME\", \"action\": \"putObject\"}" $API_GATEWAY_ENDPOINT)
    # echo ${PRESIGNED_URL:0:20}...${PRESIGNED_URL: -20}

    # put object (upload)
    echo "Upload object to s3 through the link..." 
    curl -X PUT -m 5 -f -s -H "Content-Type: multipart/form-data" --upload-file "$ELEMENT_PATH" "$PRESIGNED_URL" &>/dev/null

    # this is to test the availability of the object
    echo "Get presigned url to the test the upload was done..." 
    PRESIGNED_URL=$(curl -X POST -m 5 -f -s -d "{\"object_key\": \"$ELEMENT_NAME\", \"action\": \"getObject\"}" $API_GATEWAY_ENDPOINT)
    # echo ${PRESIGNED_URL:0:10}...${PRESIGNED_URL:-10}

    # presigned url for get result
    echo "Get presigned url to get the result of text processing..." 
    PRESIGNED_URL=$(curl -X POST -m 5 -f -s -d "{\"object_key\": \"$ELEMENT_RESULT\", \"action\": \"getResult\"}" "$API_GATEWAY_ENDPOINT")
    # echo ${PRESIGNED_URL:0:10}...${PRESIGNED_URL:-10}

    # download the result
    echo "Download the result of text processing..." 
    curl -m 5 -f -s "$PRESIGNED_URL" --output "$ELEMENT_PATH_RESULT" > /dev/null

fi