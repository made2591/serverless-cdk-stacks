const { DynamoDBClient } = require("@aws-sdk/client-dynamodb"); // CommonJS import
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb"); // CommonJS import
const { S3Client } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const { PollyClient, SynthesizeSpeechCommand } = require("@aws-sdk/client-polly");
const { RekognitionClient, DetectTextCommand } = require("@aws-sdk/client-rekognition");

const CONTENT_BUCKET = process.env.CONTENT_BUCKET
const DYNAMO_TABLE_NAME = process.env.DYNAMO_TABLE
const REGION = process.env.AWS_REGION || "eu-west-1"
const VOICE_ID = 'Kimberly'
const NO_TEXT = "Nothing found"
const OUTPUT_PREFIX = "output/"
const OUTPUT_FORMAT = "mp3"

const dynamoDBC = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3c = new S3Client({});
const pollyC = new PollyClient({ region: REGION });
const rekognitionC = new RekognitionClient({ region: REGION });

// detext text from bytes
async function detectTextFromS3Image(bucket, objectKey) {
    const command = new DetectTextCommand({
        Image: {
            S3Object: {
                Bucket: bucket,
                Name: objectKey
            }
        }
    });
    let result = [];
    try {
        const text = await rekognitionC.send(command);
        console.log(text);
        result = [text && text.TextDetections ? text.TextDetections.filter(i => i.Type === 'WORD').map(i => i.DetectedText).join(" ") : NO_TEXT, null];
        console.info(`text successfully detected from s3 object ${objectKey}: ${result[0]}`);
    } catch (error) {
        console.error(`error in detecting text from s3 object ${objectKey}: ${error}`);
        result = [NO_TEXT, error];
    } finally {
        return result;
    }
}

// read text and output audiostream
async function readTextWithPolly(text, outputFormat, voiceId) {
    const command = new SynthesizeSpeechCommand({
        Text: text,
        OutputFormat: outputFormat,
        VoiceId: voiceId
    });
    let result = [];
    try {
        const response = await pollyC.send(command);
        console.info(`text successfully read by polly: ${response}`);
        result = [response.AudioStream, null];
    } catch (error) {
        console.error(`error in read by polly of text ${text}: ${error}`);
        result = [null, error];
    } finally {
        return result;
    }
}

// save result of polly on s3
async function savePollyResultToS3(bucket, objectKey, audioStream) {
    const parallelUploads3 = new Upload({
        client: s3c,
        queueSize: 4,
        leavePartsOnError: false,
        params: {
            Bucket: bucket,
            Key: objectKey,
            Body: audioStream,
            ContentType: 'audio/' + OUTPUT_FORMAT
        },
    });
    let result = [];
    try {
        const response = await parallelUploads3.done();
        console.info(`audiostream successfully saved on s3: ${objectKey}`);
        result = [response, null];
    } catch (error) {
        console.error(`error in saving audiostream on s3 object ${objectKey}: ${error}`);
        result = [null, error];
    } finally {
        return result;
    }
};

// save reference to dynamo of the rekognized object
async function saveReferencesToDynamo(item) {
    const command = new PutCommand({
        TableName: DYNAMO_TABLE_NAME,
        Item: item
    });
    let result = [];
    try {
        const response = await dynamoDBC.send(command);
        console.info(`reference successfully saved to dynamoDB: ${JSON.stringify(response)}`);
        result = [response, null];
    } catch (error) {
        console.error(`error in saving reference to dynamoDB: ${error.stack}`);
        result = [null, error];
    } finally {
        return result;
    }
};

// start detection of text from image stored on s3
async function startDetection(rawObjectKey) {
    let error = null;
    let textRekognized = null;
    let audioStream = null;
    let s3response = null;
    let dynamoResponse = null;
    let result = {
        id: rawObjectKey,
        raw_object_key: rawObjectKey,
        text_rekognized: NO_TEXT,
        speach_object_key: null,
        error: null,
    };

    // text rekognized
    [textRekognized, error] = await detectTextFromS3Image(CONTENT_BUCKET, rawObjectKey);
    console.info(`start detection at: ${Date.now()}`);
    result.text_rekognized = textRekognized;
    if (error) {
        result.error = error;
        return result;
    }

    // get audiostream from polly
    [audioStream, error] = await readTextWithPolly(result.text_rekognized, OUTPUT_FORMAT, VOICE_ID);
    if (error) {
        result.error = error;
        return result;
    }

    // save the stream on s3
    const speachObjectKey = `${OUTPUT_PREFIX}${rawObjectKey.split("/").pop().replace(/\.[^/.]+$/, "")}.${OUTPUT_FORMAT}`;
    [s3response, error] = await savePollyResultToS3(CONTENT_BUCKET, speachObjectKey, audioStream);
    if (error) {
        result.error = error;
        return result;
    }
    result.speach_object_key = speachObjectKey;

    // save reference to dynamo
    [dynamoResponse, error] = await saveReferencesToDynamo(result);
    if (error) {
        result.error = error;
        return result;
    }
    console.info(`finish detection at: ${Date.now()}`);
    return result;
}

// lambda handler
exports.handler = async function (event) {
    try {
        console.log(JSON.stringify(event));
        let key = JSON.parse(event.Records[0].body).Records[0].s3.object.key;
        console.log(key);
        console.log(event.Records[0].receiptHandle);
        let result = await startDetection(key);
        console.log(`init handler: ${result}`);
        return result;
    } catch (error) {
        console.log(`error in handler: ${error}`);
        return error;
    }
}