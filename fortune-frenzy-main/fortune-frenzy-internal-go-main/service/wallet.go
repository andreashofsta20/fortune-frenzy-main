package service

import (
	"context"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// WalletBootstrap ensures a wallet row exists. If absent, seeds cash from Roblox profile.
// If a row already exists (e.g. seller credited while offline), returns that balance.
func WalletBootstrap(ctx context.Context, userID string, profileCash int64) (cash int64, err error) {
	coll := WalletsCollection()
	if coll == nil {
		return 0, fmt.Errorf("mongo wallet not configured")
	}
	if profileCash < 0 {
		profileCash = 0
	}

	var existing struct {
		Cash int64 `bson:"cash"`
	}
	findErr := coll.FindOne(ctx, bson.M{"_id": userID}).Decode(&existing)
	if findErr == nil {
		return existing.Cash, nil
	}
	if findErr != mongo.ErrNoDocuments {
		return 0, findErr
	}

	now := time.Now().UnixMilli()
	_, err = coll.InsertOne(ctx, bson.M{
		"_id":        userID,
		"cash":       profileCash,
		"gems":       int64(0),
		"created_at": now,
		"updated_at": now,
	})
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			_ = coll.FindOne(ctx, bson.M{"_id": userID}).Decode(&existing)
			return existing.Cash, nil
		}
		return 0, err
	}
	return profileCash, nil
}

// WalletGetBalance returns stored cash/gems without creating a document.
func WalletGetBalance(ctx context.Context, userID string) (cash int64, gems int64, found bool, err error) {
	coll := WalletsCollection()
	if coll == nil {
		return 0, 0, false, fmt.Errorf("mongo wallet not configured")
	}
	var doc struct {
		Cash int64 `bson:"cash"`
		Gems int64 `bson:"gems"`
	}
	findErr := coll.FindOne(ctx, bson.M{"_id": userID}).Decode(&doc)
	if findErr == mongo.ErrNoDocuments {
		return 0, 0, false, nil
	}
	if findErr != nil {
		return 0, 0, false, findErr
	}
	return doc.Cash, doc.Gems, true, nil
}

// WalletAdjustCash atomically applies delta to cash (upsert: new users start at 0 before increment).
// Balance is clamped to >= 0.
func WalletAdjustCash(ctx context.Context, userID string, delta int64) (cash int64, err error) {
	coll := WalletsCollection()
	if coll == nil {
		return 0, fmt.Errorf("mongo wallet not configured")
	}

	now := time.Now().UnixMilli()
	opts := options.FindOneAndUpdate().
		SetUpsert(true).
		SetReturnDocument(options.After)

	var doc struct {
		Cash int64 `bson:"cash"`
	}
	update := bson.M{
		"$inc": bson.M{"cash": delta},
		"$set": bson.M{"updated_at": now},
		"$setOnInsert": bson.M{
			"gems":       int64(0),
			"created_at": now,
		},
	}

	err = coll.FindOneAndUpdate(ctx, bson.M{"_id": userID}, update, opts).Decode(&doc)
	if err != nil {
		return 0, err
	}
	if doc.Cash < 0 {
		_, _ = coll.UpdateOne(ctx, bson.M{"_id": userID}, bson.M{"$set": bson.M{"cash": int64(0), "updated_at": time.Now().UnixMilli()}})
		return 0, nil
	}
	return doc.Cash, nil
}
