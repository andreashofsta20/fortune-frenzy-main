package models

import "time"

type Item struct {
	ID            int       `json:"id"`
	AssetID       int64     `json:"asset_id"`
	Name          string    `json:"name"`
	Creator       string    `json:"creator"`
	Description   string    `json:"description"`
	AveragePrice  int64     `json:"average_price"`
	TotalUnboxed  int64     `json:"total_unboxed"`
	MaximumCopies int64     `json:"maximum_copies"`
	Value         int64     `json:"value"`
	CreatedAt     time.Time `json:"created_at"`
	Color         string    `json:"color"`
}

type ItemListing struct {
	UserAssetID string     `json:"user_asset_id"`
	SellerID    string     `json:"seller_id"`
	Currency    string     `json:"currency"`
	CreatedAt   time.Time  `json:"created_at"`
	ExpiresAt   *time.Time `json:"expires_at,omitempty"`
	Price       string     `json:"price"`
	ItemID      string     `json:"item_id"`
	Username    *string    `json:"username,omitempty"`
	DisplayName *string    `json:"display_name,omitempty"`
}

type ItemOwner struct {
	CopyID       string    `json:"copy_id"`
	ItemID       string    `json:"item_id"`
	OwnerID      string    `json:"owner_id"`
	UserAssetID  string    `json:"user_asset_id"`
	AcquiredAt   time.Time `json:"acquired_at"`
	SerialNumber int       `json:"serial_number"`
	Username     *string   `json:"username,omitempty"`
	DisplayName  *string   `json:"display_name,omitempty"`
}