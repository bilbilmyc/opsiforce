#!/usr/bin/env python3
"""Allow first-time model metadata saves without inventing model prices."""
from pathlib import Path
import sys
p=Path(sys.argv[1])/'transports/bifrost-http/server/server.go'
s=p.read_text()
marker='\t\tfor _, e := range entries {\n\t\t\trows, err := s.Config.ConfigStore.UpsertModelPricingAttributes'
replacement='''\t\tfor _, e := range entries {
			// Seed only missing chat catalog rows. Unknown prices stay NULL;
			// existing rows and their prices are never replaced.
			var count int64
			if err := tx.Model(&tables.TableModelPricing{}).Where("model = ? AND provider = ?", e.Model, e.Provider).Count(&count).Error; err != nil {
				return err
			}
			if count == 0 {
				row := tables.TableModelPricing{Model: e.Model, Provider: e.Provider, Mode: "chat"}
				if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&row).Error; err != nil {
					return err
				}
			}
			rows, err := s.Config.ConfigStore.UpsertModelPricingAttributes'''
if replacement in s: sys.exit(0)
assert s.count(marker)==1, 'Pinned upstream changed; review catalog patch'
s=s.replace('// whole batch is wrapped in a single transaction so a missing pricing row\n// rolls back the lot.', '// whole batch is wrapped in a single transaction; missing chat rows are\n// created with unknown prices before metadata is written.')
s=s.replace(marker,replacement).replace('"gorm.io/gorm"','"gorm.io/gorm"\n\t"gorm.io/gorm/clause"')
p.write_text(s)
