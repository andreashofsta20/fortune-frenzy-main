package models

import "time"

type Item struct {
	ID                   string    `json:"id"`
	AssetID              string    `json:"asset_id"`
	Name                 string    `json:"name"`
	Creator              string    `json:"creator"`
	Description          string    `json:"description"`
	AveragePrice         int64     `json:"average_price"` // Mean listing price (cash) when listed; 0 if none
	TotalUnboxed         int64     `json:"total_unboxed"`
	MaximumCopies        int64     `json:"maximum_copies"`
	Value                int64     `json:"value"` // Rolimons value
	CopiesInCirculation  int64     `json:"copies_in_circulation"`
	CreatedAt            time.Time `json:"created_at"`
	UpdatedAt            time.Time `json:"updated_at"`
	Color                string    `json:"color"`
	Category                string `json:"category"`
	// 1 = quick-buy allowed; 0 = cases / trading / resellers only (integer so JSON always includes the field).
	AllowDirectShopPurchase int `json:"allow_direct_shop_purchase"`
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