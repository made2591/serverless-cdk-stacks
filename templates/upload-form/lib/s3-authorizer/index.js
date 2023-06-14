const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");

const bucket = process.env.S3_BUCKET
if (!bucket) {
    throw Error(`S3 bucket not set`)
}
const config = {
    region: process.env.AWS_REGION || "eu-west-1",
};
const client = new S3Client(config);

async function getSignedPutUrl(fileName, bucket, expiresIn) {
    const command = new PutObjectCommand({
        Bucket: bucket,
        Key: "input/" + fileName,
    });
    return await getSignedUrl(client, command, { expiresIn });
}

async function getSignedGetUrl(fileName, bucket, expiresIn) {
    const command = new GetObjectCommand({
        Bucket: bucket,
        Key: "input/" + fileName,
    });
    return await getSignedUrl(client, command, { expiresIn });
}

// just a fast way to provide access to result, not passing through dynamo storing
async function getSignedGetResultUrl(fileName, bucket, expiresIn) {
    const command = new GetObjectCommand({
        Bucket: bucket,
        Key: "output/" + fileName,
    });
    return await getSignedUrl(client, command, { expiresIn });
}

exports.handler = async function (event) {
    try {
        const key = JSON.parse(event.body)['object_key'];
        const action = JSON.parse(event.body)['action'];
        let result = "";
        if (!key) {
            throw Error('S3 object key missing')
        }
        if (!action) {
            throw Error('Action on S3 object missing')
        }
        switch (action) {
            case "putObject": {
                result = await getSignedPutUrl(key, bucket, 100);
                break
            }
            case "getObject": {
                result = await getSignedGetUrl(key, bucket, 100);
                break
            }
            // just a fast way to provide access to result, not passing through dynamo storing
            case "getResult": {
                result = await getSignedGetResultUrl(key, bucket, 100);
                break
            }
            default: {
                throw Error('Action not allowed')
            }
        }
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'text/plain' },
            body: result
        }
    } catch (error) {
        throw Error(`Error in backend: ${error}`)
    }
}