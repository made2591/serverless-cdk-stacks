import cdk = require('aws-cdk-lib');

import apigateway = require('aws-cdk-lib/aws-apigateway');
import iam = require('aws-cdk-lib/aws-iam');
import lambda = require('aws-cdk-lib/aws-lambda');
import s3 = require('aws-cdk-lib/aws-s3');
import sqs = require('aws-cdk-lib/aws-sqs');
import os = require('os');

import { Stage } from '../lib/stage-env/stage-env';

import { BucketEncryption } from 'aws-cdk-lib/aws-s3';

export interface UploadFormStackProps extends cdk.StackProps {
  stage: Stage;
}

export interface UploadFormStack extends cdk.Stack {
  uploadApiAuthorizer: apigateway.RestApi;
  contentBucket: s3.Bucket;
  s3AuthLambda: lambda.Function;
  sqsQueue?: sqs.QueueBase;
}

export class UploadFormStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props: UploadFormStackProps) {
    super(scope, id, props);

    // create content s3 bucket
    this.contentBucket = new s3.Bucket(this, props.stage.toString() + '-content', {
      encryption: BucketEncryption.S3_MANAGED,
      publicReadAccess: false
    })

    // create lambda policy statement for operating over s3
    var lambdaS3PolicyStatement = new iam.PolicyStatement()
    lambdaS3PolicyStatement.addActions(
      's3:PutObject',
      's3:GetObject'
    )
    lambdaS3PolicyStatement.addResources(
      this.contentBucket.bucketArn + '/*'
    );

    // create s3 authorizer lambda
    const cwd = os.getcwd()
    this.s3AuthLambda = new lambda.Function(this, props.stage.toString() + '-s3-auth', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(os.path.join(cwd, "lib/s3-authorizer")),
      environment: { 'S3_BUCKET': this.contentBucket.bucketName },
      initialPolicy: [lambdaS3PolicyStatement]
    })

    // give to apigateway permission to invoke the lambda
    new lambda.CfnPermission(this, props.stage.toString() + '-apigtw-lambda-permission', {
      functionName: this.s3AuthLambda.functionArn,
      action: 'lambda:InvokeFunction',
      principal: 'apigateway.amazonaws.com'
    })

    // defines an API Gateway REST API resource backed by our s3 uploader function.
    this.uploadApiAuthorizer = new apigateway.LambdaRestApi(this, props.stage.toString() + '-apigtw', {
      handler: this.s3AuthLambda,
      deployOptions: { stageName: props.stage.toString() }
    });

  }
}
