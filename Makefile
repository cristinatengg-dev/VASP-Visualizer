.PHONY: help deploy deploy-help

help:
	@echo "Targets:"
	@echo "  deploy       Deploy to production via deploy.sh"
	@echo "  deploy-help  Show deploy script help"

deploy:
	@bash deploy.sh

deploy-help:
	@sed -n '1,90p' deploy.sh
