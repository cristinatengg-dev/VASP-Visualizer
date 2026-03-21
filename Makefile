.PHONY: help deploy deploy-help

help:
	@echo "Targets:"
	@echo "  deploy       Deploy to production via upload_and_deploy.sh"
	@echo "  deploy-help  Show deploy script help"

deploy:
	@bash upload_and_deploy.sh

deploy-help:
	@bash upload_and_deploy.sh --help
