package models

type CoinflipData struct {
	ID           string    `json:"id"`
	Player1      UserInfo  `json:"player1"`
	Player2      *UserInfo `json:"player2"`
	Player1Items []string  `json:"player1_items"`
	Player2Items []string  `json:"player2_items"`
	Status       string    `json:"status"`
	Type         string    `json:"type"`
	ServerID     string    `json:"server_id"`
	Player1Coin  int       `json:"player1_coin"`
	WinningCoin  *int      `json:"winning_coin"`
	TransferID   string    `json:"transfer_id"`
	AutoID       int64     `json:"auto_id"`
}
