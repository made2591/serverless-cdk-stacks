import cdk = require('aws-cdk-lib/core');
import cloudtrail = require('aws-cdk-lib/aws-cloudtrail');
import iam = require('aws-cdk-lib/aws-iam');
import sqs = require('aws-cdk-lib/aws-sqs');
import s3 = require('aws-cdk-lib/aws-s3');
import s3n = require('aws-cdk-lib/aws-s3-notifications');

import { UploadFormStack, UploadFormStackProps } from "../../upload-form/lib/upload-form-stack";
import { ReadWriteType } from 'aws-cdk-lib/aws-cloudtrail';

export interface ProducerConsumerStackProps extends UploadFormStackProps {
}

export interface ProducerConsumerStack extends UploadFormStack {
  sqsQueue: sqs.Queue
}

export class ProducerConsumerStack extends UploadFormStack {
  constructor(scope: cdk.App, id: string, props: ProducerConsumerStackProps) {
    super(scope, id, props);

    // create trail to enable events on s3
    const trail = new cloudtrail.Trail(this, props.stage.toString() + 'content-bucket-trail');
    trail.addS3EventSelector([{ bucket: this.contentBucket, objectPrefix: "/*",}], {
      includeManagementEvents: false,
      readWriteType: ReadWriteType.ALL,
    });

    // create sqs queue
    this.sqsQueue = new sqs.Queue(this, props.stage.toString() + "-sqs-content-queue", {
      retentionPeriod: cdk.Duration.days(14),
      visibilityTimeout: cdk.Duration.seconds(360),
      deadLetterQueue: {
        queue: new sqs.Queue(this, props.stage.toString() + "-sqs-dead-queue", 
        { retentionPeriod: cdk.Duration.days(14) }),
        maxReceiveCount: 5
      }
    });

    // create s3 sqs policy to allow notification
    new iam.Role(this, props.stage.toString()+'s3-sqs-notification', {
      assumedBy: new iam.ServicePrincipal('s3.amazonaws.com'),
      inlinePolicies: {
        "S3SQSNotification": new iam.PolicyDocument({
          statements: [new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [ 'SQS:SendMessage', ],
            resources: [this.sqsQueue.queueArn],
          })],
        })
      },
      description: 'S3 SQS Notification',
    });
    
    this.contentBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.SqsDestination(this.sqsQueue), {
      prefix: "input/"
    })

  }
}
